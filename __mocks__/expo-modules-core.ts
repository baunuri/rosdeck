// Native modules don't exist under Jest; code paths fall back as they do on web.
export const requireOptionalNativeModule = () => null;
export const requireNativeModule = () => { throw new Error('native modules are unavailable in tests'); };
