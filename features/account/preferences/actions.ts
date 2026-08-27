"use server";

import { getServerSupabase } from "@/lib/supabase/server";

export async function setReduceMotionPref(value: boolean) {
  const supabase = await getServerSupabase();
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, reduce_motion: value });
}
