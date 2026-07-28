// 'server-only' 包的 exports 只在 react-server 条件下映射到空模块，其余条件下
// 解析到会主动抛错的 index.js。单测跑在 node 环境（没有该条件），任何 import 了
// 服务端模块的测试都会在导入阶段就炸。
//
// 不直接给 vitest 加 resolve.conditions: ['react-server']：那会连带改变 react 等
// 包的解析结果（它们也有 react-server 分支），影响面远超需要。这里只替换这一个包。
export {};
