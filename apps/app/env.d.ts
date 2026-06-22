declare const process: {
  env: {
    EXPO_PUBLIC_ANALYTICS_ENABLED?: string;
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_GOOGLE_ADS_CHAT_3_MESSAGES_LABEL?: string;
    EXPO_PUBLIC_GOOGLE_ADS_CHECKOUT_STARTED_LABEL?: string;
    EXPO_PUBLIC_GOOGLE_ADS_FIRST_CHAT_LABEL?: string;
    EXPO_PUBLIC_GOOGLE_ADS_ID?: string;
    EXPO_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL?: string;
    EXPO_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL?: string;
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
