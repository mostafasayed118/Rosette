export type DataSource = 'local' | 'supabase';

export function selectDataSource(config: { url?: string; key?: string }): DataSource {
  return config.url && config.key ? 'supabase' : 'local';
}
