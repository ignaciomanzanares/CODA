declare module '@coda/db/schema' {
  // Re-export the generated declarations from the built package so
  // TypeScript can resolve types during isolated service builds.
  export * from '../../../packages/dist/schema.d';
}
