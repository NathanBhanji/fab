/** Disable the auto-updater for probes only; preserve update settings for other invocations. */
export function grokProbeEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...environment, GROK_DISABLE_AUTOUPDATER: "1" };
}
