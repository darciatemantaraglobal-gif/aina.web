import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log("Setting up user_badges table...\n");

  // Create user_badges table via RPC (raw SQL)
  const { error: createErr } = await supabase.rpc("exec_sql", {
    sql: `
      CREATE TABLE IF NOT EXISTS user_badges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        badge_type text NOT NULL,
        awarded_at timestamptz NOT NULL DEFAULT now(),
        awarded_by uuid REFERENCES auth.users(id),
        UNIQUE(user_id, badge_type)
      );
      CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
      ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Users can view own badges" ON user_badges;
      CREATE POLICY "Users can view own badges" ON user_badges FOR SELECT USING (auth.uid() = user_id);
      DROP POLICY IF EXISTS "Service role can manage badges" ON user_badges;
      CREATE POLICY "Service role can manage badges" ON user_badges FOR ALL USING (true) WITH CHECK (true);
    `,
  });

  if (createErr) {
    // Table might already exist or RPC not available — try direct insert approach
    console.log("Note: RPC exec_sql not available, trying alternative approach...");
    console.log("Please run this SQL in your Supabase SQL editor:\n");
    console.log(`
CREATE TABLE IF NOT EXISTS user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_type text NOT NULL,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  awarded_by uuid REFERENCES auth.users(id),
  UNIQUE(user_id, badge_type)
);
CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own badges" ON user_badges FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage badges" ON user_badges FOR ALL USING (true);
    `);
  } else {
    console.log("✓ Table created (or already exists)");
  }

  // Get all current users from profiles
  const { data: profiles, error: profilesErr } = await supabase
    .from("profiles")
    .select("user_id, full_name, email");

  if (profilesErr) {
    console.error("Error fetching profiles:", profilesErr.message);
    return;
  }

  console.log(`\nAwarding beta_tester badge to ${profiles.length} existing users...\n`);

  let awarded = 0;
  let skipped = 0;

  for (const profile of profiles) {
    const { error } = await supabase
      .from("user_badges")
      .upsert(
        { user_id: profile.user_id, badge_type: "beta_tester" },
        { onConflict: "user_id,badge_type", ignoreDuplicates: true }
      );

    if (error) {
      console.log(`✗ ${profile.email || profile.user_id}: ${error.message}`);
      skipped++;
    } else {
      console.log(`✓ ${profile.email || profile.user_id}`);
      awarded++;
    }
  }

  console.log(`\nDone! Awarded: ${awarded}, Skipped/errors: ${skipped}`);
}

main().catch(console.error);
