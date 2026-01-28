declare module 'xlsx' {
  const content: any;
  export = content;
  export const utils: any;
  export function read(data: any, opts?: any): any;
}
