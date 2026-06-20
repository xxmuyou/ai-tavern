declare const process: {
  env: {
    EXPO_PUBLIC_ANALYTICS_ENABLED?: string;
    EXPO_PUBLIC_API_URL?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
    [key: string]: string | undefined;
  };
};

declare module 'react-native-web/dist/modules/AssetRegistry' {
  export function getAssetByID(assetId: number): {
    httpServerLocation: string;
    name: string;
    scales: number[];
    type: string;
  } | null;
}
