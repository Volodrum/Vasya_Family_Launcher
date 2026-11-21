// electron-vite copies `?asset` imports into the build and returns their path at runtime.
declare module '*?asset' {
  const path: string
  export default path
}
