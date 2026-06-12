export const CRON_WEATHER = "0 */2 * * *";
export const CRON_CAMPSITES = "0 3 * * 1";

export async function dispatchCron(cron: string, _env: Env, _ctx: ExecutionContext): Promise<void> {
  switch (cron) {
    case CRON_WEATHER:
      return; // refresh-weather lands in S04
    case CRON_CAMPSITES:
      return; // refresh-campsites lands in S06
  }
}
