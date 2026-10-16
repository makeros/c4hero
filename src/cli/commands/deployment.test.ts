/// <reference types="node" />
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseDSL, serializeDSL } from '@/lib/dsl'
import { createMicroservicesTemplate } from '@/lib/templates'
import { parseArgs } from '../args'
import type { CliResult } from '../output'
import { deploy } from './deployment'

let dir: string
let file: string

beforeEach(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), 'c4hero-deploy-'))
  file = path.join(dir, 'shop.dsl')
  writeFileSync(file, serializeDSL(createMicroservicesTemplate()))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

async function run(...argv: string[]): Promise<CliResult> {
  return deploy.run(parseArgs(['deploy', ...argv, '--file', file]), { cwd: dir })
}

function reparsed() {
  const text = readFileSync(file, 'utf8')
  const { workspace, errors } = parseDSL(text)
  expect(errors).toEqual([])
  return { text, ws: workspace, env: workspace.model.deploymentEnvironments![0] }
}

async function topology() {
  await run('env', 'add', 'Production')
  await run('node', 'add', '--env', 'Production', '--name', 'AWS Cloud', '--technology', 'AWS')
  await run('node', 'add', '--env', 'Production', '--name', 'Web Server', '--parent', 'AWS Cloud', '--instances', '3')
  await run('instance', 'add', '--node', 'Web Server', '--of', 'apiGateway')
  await run('infra', 'add', '--node', 'Web Server', '--name', 'Load Balancer', '--technology', 'ALB')
}

describe('deploy command', () => {
  it('builds an environment with nested nodes, an instance and infrastructure with readable ids', async () => {
    await topology()
    const { env } = reparsed()
    expect(env.name).toBe('Production')
    const cloud = env.deploymentNodes[0]
    expect([cloud.id, cloud.name, cloud.technology]).toEqual(['awsCloud', 'AWS Cloud', 'AWS'])
    const web = cloud.children[0]
    expect([web.id, web.instances]).toEqual(['webServer', '3'])
    expect(web.containerInstances.map((i) => [i.id, i.containerId])).toEqual([['apiGatewayInstance', 'apiGateway']])
    expect(web.infrastructureNodes.map((i) => [i.id, i.name, i.technology])).toEqual([['loadBalancer', 'Load Balancer', 'ALB']])
  })

  it('honours --id, adds a system instance and rejects bad targets', async () => {
    await run('env', 'add', 'Live')
    await run('node', 'add', '--env', 'Live', '--name', 'Box', '--id', 'box1')
    await run('instance', 'add', '--node', 'box1', '--of', 'platform')
    const { env } = reparsed()
    expect(env.deploymentNodes[0].id).toBe('box1')
    expect(env.deploymentNodes[0].softwareSystemInstances[0].softwareSystemId).toBe('platform')
    await expect(run('instance', 'add', '--node', 'box1', '--of', 'customer')).rejects.toMatchObject({ code: 'USAGE' })
    await expect(run('node', 'add', '--env', 'Live', '--name', 'Other', '--id', 'box1')).rejects.toMatchObject({ code: 'VALIDATION' })
    await expect(run('node', 'add', '--env', 'Missing', '--name', 'X')).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(run('node', 'add', '--env', 'Live', '--name', 'X', '--parent', 'nope')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('removes a node together with its subtree', async () => {
    await topology()
    const res = await run('remove', 'AWS Cloud')
    expect(res.changed?.elements).toEqual(
      expect.arrayContaining(['awsCloud', 'webServer', 'apiGatewayInstance', 'loadBalancer']),
    )
    expect(reparsed().env.deploymentNodes).toEqual([])
  })

  it('removes an instance and an infrastructure node alone', async () => {
    await topology()
    await run('remove', 'apiGatewayInstance')
    await run('remove', 'loadBalancer')
    const web = reparsed().env.deploymentNodes[0].children[0]
    expect(web.containerInstances).toEqual([])
    expect(web.infrastructureNodes).toEqual([])
  })

  it('prunes removed ids from the sidecar', async () => {
    await topology()
    const sidecar = path.join(dir, 'shop.c4hero.json')
    writeFileSync(sidecar, JSON.stringify({ version: 1, elements: { webServer: { owner: 'x' }, customer: { owner: 'y' } } }))
    await run('remove', 'webServer')
    const left = existsSync(sidecar) ? readFileSync(sidecar, 'utf8') : ''
    expect(left).not.toContain('webServer')
  })

  it('reports ambiguous node names', async () => {
    await run('env', 'add', 'A')
    await run('env', 'add', 'B')
    await run('node', 'add', '--env', 'A', '--name', 'Server')
    await run('node', 'add', '--env', 'B', '--name', 'Server')
    await expect(run('instance', 'add', '--node', 'Server', '--of', 'apiGateway')).rejects.toMatchObject({ code: 'AMBIGUOUS' })
    await run('instance', 'add', '--node', 'Server', '--env', 'A', '--of', 'apiGateway')
  })

  it('rejects unknown subcommands', async () => {
    await expect(run('bogus')).rejects.toMatchObject({ code: 'USAGE' })
  })
})
