// ============================================================
//  FILE: lib/supabase/premium.js
//  Helper functions for premium feature access control
// ============================================================

/**
 * Check if user has premium access
 * @param {SupabaseClient} admin - Admin Supabase client
 * @param {string} userId - User ID from Clerk auth
 * @returns {Promise<{isPremium: boolean, features: object, tier: string}>}
 */
export async function checkPremiumStatus(admin, userId) {
  try {
    const { data, error } = await admin
      .from("user_subscriptions")
      .select("is_premium, subscription_tier, features_enabled")
      .eq("user_id", userId)
      .single();

    if (error) {
      // User not found in subscriptions table - treat as free user
      return {
        isPremium: false,
        tier: "free",
        features: {
          exam_predictor: false,
          cheatsheet_generator: false,
          numericals_generator: false,
        },
      };
    }

    if (!data) {
      return {
        isPremium: false,
        tier: "free",
        features: {
          exam_predictor: false,
          cheatsheet_generator: false,
          numericals_generator: false,
        },
      };
    }

    return {
      isPremium: data.is_premium ?? false,
      tier: data.subscription_tier ?? "free",
      features: data.features_enabled ?? {
        exam_predictor: false,
        cheatsheet_generator: false,
        numericals_generator: false,
      },
    };
  } catch (err) {
    console.error("[checkPremiumStatus] Error:", err.message);
    return {
      isPremium: false,
      tier: "free",
      features: {
        exam_predictor: false,
        cheatsheet_generator: false,
        numericals_generator: false,
      },
    };
  }
}

/**
 * Check if user has access to specific feature
 * @param {SupabaseClient} admin - Admin Supabase client
 * @param {string} userId - User ID from Clerk auth
 * @param {string} featureName - Feature to check (exam_predictor, cheatsheet_generator, numericals_generator)
 * @returns {Promise<boolean>}
 */
export async function hasFeatureAccess(admin, userId, featureName) {
  const { isPremium, features } = await checkPremiumStatus(admin, userId);
  return isPremium && features[featureName] === true;
}

/**
 * Verify premium access - throws error if not premium
 * @param {SupabaseClient} admin - Admin Supabase client
 * @param {string} userId - User ID from Clerk auth
 * @param {string} featureName - Feature to check
 * @throws {Error} If user doesn't have access
 * @returns {Promise<object>} Premium status data
 */
export async function requirePremium(admin, userId, featureName) {
  const { isPremium, features, tier } = await checkPremiumStatus(admin, userId);

  if (!isPremium) {
    const error = new Error("Premium subscription required");
    error.code = "PREMIUM_REQUIRED";
    error.status = 403;
    throw error;
  }

  if (!features[featureName]) {
    const error = new Error(`Feature '${featureName}' not enabled in your plan`);
    error.code = "FEATURE_NOT_ENABLED";
    error.status = 403;
    throw error;
  }

  return { isPremium: true, tier, features };
}

/**
 * Create or update user subscription record
 * @param {SupabaseClient} admin - Admin Supabase client
 * @param {string} userId - User ID
 * @param {object} subscriptionData - Subscription data to upsert
 * @returns {Promise<object>}
 */
export async function upsertSubscription(admin, userId, subscriptionData) {
  const { data, error } = await admin
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        ...subscriptionData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select()
    .single();

  if (error) {
    console.error("[upsertSubscription] Error:", error.message);
    throw error;
  }

  return data;
}

/**
 * Enable premium features for user
 * @param {SupabaseClient} admin - Admin Supabase client
 * @param {string} userId - User ID
 * @param {string} tier - Subscription tier (premium, pro)
 * @returns {Promise<object>}
 */
export async function enablePremiumFeatures(admin, userId, tier = "premium") {
  return upsertSubscription(admin, userId, {
    is_premium: true,
    subscription_tier: tier,
    features_enabled: {
      exam_predictor: true,
      cheatsheet_generator: true,
      numericals_generator: true,
    },
  });
}

/**
 * Disable premium features for user
 * @param {SupabaseClient} admin - Admin Supabase client
 * @param {string} userId - User ID
 * @returns {Promise<object>}
 */
export async function disablePremiumFeatures(admin, userId) {
  return upsertSubscription(admin, userId, {
    is_premium: false,
    subscription_tier: "free",
    features_enabled: {
      exam_predictor: false,
      cheatsheet_generator: false,
      numericals_generator: false,
    },
  });
}
