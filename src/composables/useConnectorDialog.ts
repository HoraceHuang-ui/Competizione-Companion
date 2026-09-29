import { ref } from 'vue'

// 直连相关弹窗的开关状态（模块级共享）。
// 除了页面左下角按钮，服务器卡片上的 >>（connectServer()）也需要在加入列表的同时打开直连弹窗，
// 而 connectServer() 位于 utils 中、与弹窗不在同一组件树，因此用模块级共享 ref。
// 刻意不放进 pinia store：store 配置了 persist: true，放进去会把弹窗开关一并持久化，
// 导致退出时弹窗开着、下次启动自动弹出。
const open = ref(false)
// “手动添加服务器”弹窗：作为直连弹窗的兄弟节点渲染，而不是嵌套在它内部。
// mdui-dialog 没有对话框栈，Esc 的 keydown 会沿 DOM 一路冒泡，
// 若嵌套则按一次 Esc 会同时关掉里外两层；兄弟节点布局下只有拿到焦点的那个会关。
const addServerOpen = ref(false)

export const useConnectorDialog = () => ({
  open,
  openConnectorDialog: () => {
    open.value = true
  },
  addServerOpen,
  openAddServerDialog: () => {
    addServerOpen.value = true
  },
})
