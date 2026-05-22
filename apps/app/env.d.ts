declare const process: {
  env: {
    EXPO_PUBLIC_API_URL?: string;
    NODE_ENV?: 'development' | 'production' | 'test';
    [key: string]: string | undefined;
  };
};
