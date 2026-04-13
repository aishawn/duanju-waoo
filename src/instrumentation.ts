// Next.js Instrumentation - 在应用启动时执行
// https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
//
// 保持本文件不含任何会拉到 Prisma / BullMQ / Redis 的 import（含动态 import），
// 否则 Edge Instrumentation 打包会解析 wasm-engine-edge 并触发 setImmediate 报错。

export async function register() {
  if (process.env.NEXT_RUNTIME === 'edge') {
    return
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNodeInstrumentation } = await import('./lib/instrumentation/register-node')
    await registerNodeInstrumentation()
  }
}
