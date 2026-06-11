import type { Href } from 'expo-router';

export const AUTH_LOGIN_ROUTE = '/auth/login' as Href;
export const ADMIN_ROUTE = '/admin' as Href;
export const BILLING_ROUTE = '/billing' as Href;
export const DISCOVER_ROUTE = '/' as Href;
// Legacy compatibility route. Product-facing web navigation calls this
// experience "Discover"; keep /companions so old links continue to resolve.
export const COMPANIONS_ROUTE = '/companions' as Href;
export const ME_ROUTE = '/me' as Href;
export const MEMORIES_ROUTE = '/memories' as Href;
export const PERSONAS_ROUTE = '/personas' as Href;
export const SCENES_ROUTE = '/scenes' as Href;
export const TODAY_ROUTE = DISCOVER_ROUTE;
