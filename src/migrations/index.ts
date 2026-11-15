import * as migration_20261114_030322_foundation from './20261114_030322_foundation';
import * as migration_20261114_030640_reservation_guards from './20261114_030640_reservation_guards';
import * as migration_20261114_032157_customer_identities from './20261114_032157_customer_identities';
import * as migration_20261114_032409_staff_access_boundary from './20261114_032409_staff_access_boundary';
import * as migration_20261114_035520_audit_immutability from './20261114_035520_audit_immutability';
import * as migration_20261114_044747_public_content from './20261114_044747_public_content';
import * as migration_20261114_050156_public_headline from './20261114_050156_public_headline';
import * as migration_20261114_051441_posts_enquiries from './20261114_051441_posts_enquiries';
import * as migration_20261114_052943_editorial_fixture_guard from './20261114_052943_editorial_fixture_guard';
import * as migration_20261114_054413_checkout_drafts from './20261114_054413_checkout_drafts';
import * as migration_20261114_055830_customer_auth_capabilities from './20261114_055830_customer_auth_capabilities';
import * as migration_20261115_182340_customer_history_claims from './20261115_182340_customer_history_claims';
import * as migration_20261115_183744_physical_inventory from './20261115_183744_physical_inventory';
import * as migration_20261115_185704_immutable_quotes_rates from './20261115_185704_immutable_quotes_rates';
import * as migration_20261115_193116_account_offer_usage from './20261115_193116_account_offer_usage';
import * as migration_20261115_203440_durable_work from './20261115_203440_durable_work';
import * as migration_20261115_204353_atomic_checkout from './20261115_204353_atomic_checkout';

export const migrations = [
  {
    up: migration_20261114_030322_foundation.up,
    down: migration_20261114_030322_foundation.down,
    name: '20261114_030322_foundation',
  },
  {
    up: migration_20261114_030640_reservation_guards.up,
    down: migration_20261114_030640_reservation_guards.down,
    name: '20261114_030640_reservation_guards',
  },
  {
    up: migration_20261114_032157_customer_identities.up,
    down: migration_20261114_032157_customer_identities.down,
    name: '20261114_032157_customer_identities',
  },
  {
    up: migration_20261114_032409_staff_access_boundary.up,
    down: migration_20261114_032409_staff_access_boundary.down,
    name: '20261114_032409_staff_access_boundary',
  },
  {
    up: migration_20261114_035520_audit_immutability.up,
    down: migration_20261114_035520_audit_immutability.down,
    name: '20261114_035520_audit_immutability',
  },
  {
    up: migration_20261114_044747_public_content.up,
    down: migration_20261114_044747_public_content.down,
    name: '20261114_044747_public_content',
  },
  {
    up: migration_20261114_050156_public_headline.up,
    down: migration_20261114_050156_public_headline.down,
    name: '20261114_050156_public_headline',
  },
  {
    up: migration_20261114_051441_posts_enquiries.up,
    down: migration_20261114_051441_posts_enquiries.down,
    name: '20261114_051441_posts_enquiries',
  },
  {
    up: migration_20261114_052943_editorial_fixture_guard.up,
    down: migration_20261114_052943_editorial_fixture_guard.down,
    name: '20261114_052943_editorial_fixture_guard',
  },
  {
    up: migration_20261114_054413_checkout_drafts.up,
    down: migration_20261114_054413_checkout_drafts.down,
    name: '20261114_054413_checkout_drafts',
  },
  {
    up: migration_20261114_055830_customer_auth_capabilities.up,
    down: migration_20261114_055830_customer_auth_capabilities.down,
    name: '20261114_055830_customer_auth_capabilities',
  },
  {
    up: migration_20261115_182340_customer_history_claims.up,
    down: migration_20261115_182340_customer_history_claims.down,
    name: '20261115_182340_customer_history_claims',
  },
  {
    up: migration_20261115_183744_physical_inventory.up,
    down: migration_20261115_183744_physical_inventory.down,
    name: '20261115_183744_physical_inventory',
  },
  {
    up: migration_20261115_185704_immutable_quotes_rates.up,
    down: migration_20261115_185704_immutable_quotes_rates.down,
    name: '20261115_185704_immutable_quotes_rates',
  },
  {
    up: migration_20261115_193116_account_offer_usage.up,
    down: migration_20261115_193116_account_offer_usage.down,
    name: '20261115_193116_account_offer_usage',
  },
  {
    up: migration_20261115_203440_durable_work.up,
    down: migration_20261115_203440_durable_work.down,
    name: '20261115_203440_durable_work',
  },
  {
    up: migration_20261115_204353_atomic_checkout.up,
    down: migration_20261115_204353_atomic_checkout.down,
    name: '20261115_204353_atomic_checkout'
  },
];
