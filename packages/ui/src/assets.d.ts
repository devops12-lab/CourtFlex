// Image imports are turned into URLs by Vite in the apps that use this package.
declare module "*.png" {
  const url: string;
  export default url;
}
declare module "*.webp" {
  const url: string;
  export default url;
}
