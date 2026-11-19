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
import * as migration_20261115_212448_checkout_status_dispatch from './20261115_212448_checkout_status_dispatch';
import * as migration_20261115_223031_payment_inbox from './20261115_223031_payment_inbox';
import * as migration_20261115_224545_canonical_payments from './20261115_224545_canonical_payments';
import * as migration_20261115_234357_payment_recovery from './20261115_234357_payment_recovery';
import * as migration_20261116_004618_transactional_email from './20261116_004618_transactional_email';
import * as migration_20261116_015111_direct_bookings from './20261116_015111_direct_bookings';
import * as migration_20261116_021800_direct_entry_recovery from './20261116_021800_direct_entry_recovery';
import * as migration_20261116_023100_direct_command_required from './20261116_023100_direct_command_required';
import * as migration_20261116_025903_booking_changes from './20261116_025903_booking_changes';
import * as migration_20261116_035134_refund_operations from './20261116_035134_refund_operations';
import * as migration_20261116_041746_refund_evidence from './20261116_041746_refund_evidence';
import * as migration_20261119_111300_operations_workspace from './20261119_111300_operations_workspace';
import * as migration_20261119_115023_account_lifecycle from './20261119_115023_account_lifecycle';
import * as migration_20261119_121350_recovery_fences from './20261119_121350_recovery_fences';
import * as migration_20261119_130748_refund_checks from './20261119_130748_refund_checks';
import * as migration_20261119_131742_recovery_holds from './20261119_131742_recovery_holds';
import * as migration_20261119_150000_restrict_data_api from './20261119_150000_restrict_data_api';

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
    name: '20261115_204353_atomic_checkout',
  },
  {
    up: migration_20261115_212448_checkout_status_dispatch.up,
    down: migration_20261115_212448_checkout_status_dispatch.down,
    name: '20261115_212448_checkout_status_dispatch',
  },
  {
    up: migration_20261115_223031_payment_inbox.up,
    down: migration_20261115_223031_payment_inbox.down,
    name: '20261115_223031_payment_inbox',
  },
  {
    up: migration_20261115_224545_canonical_payments.up,
    down: migration_20261115_224545_canonical_payments.down,
    name: '20261115_224545_canonical_payments',
  },
  {
    up: migration_20261115_234357_payment_recovery.up,
    down: migration_20261115_234357_payment_recovery.down,
    name: '20261115_234357_payment_recovery',
  },
  {
    up: migration_20261116_004618_transactional_email.up,
    down: migration_20261116_004618_transactional_email.down,
    name: '20261116_004618_transactional_email',
  },
  {
    up: migration_20261116_015111_direct_bookings.up,
    down: migration_20261116_015111_direct_bookings.down,
    name: '20261116_015111_direct_bookings',
  },
  {
    up: migration_20261116_021800_direct_entry_recovery.up,
    down: migration_20261116_021800_direct_entry_recovery.down,
    name: '20261116_021800_direct_entry_recovery',
  },
  {
    up: migration_20261116_023100_direct_command_required.up,
    down: migration_20261116_023100_direct_command_required.down,
    name: '20261116_023100_direct_command_required',
  },
  {
    up: migration_20261116_025903_booking_changes.up,
    down: migration_20261116_025903_booking_changes.down,
    name: '20261116_025903_booking_changes',
  },
  {
    up: migration_20261116_035134_refund_operations.up,
    down: migration_20261116_035134_refund_operations.down,
    name: '20261116_035134_refund_operations',
  },
  {
    up: migration_20261116_041746_refund_evidence.up,
    down: migration_20261116_041746_refund_evidence.down,
    name: '20261116_041746_refund_evidence',
  },
  {
    up: migration_20261119_111300_operations_workspace.up,
    down: migration_20261119_111300_operations_workspace.down,
    name: '20261119_111300_operations_workspace',
  },
  {
    up: migration_20261119_115023_account_lifecycle.up,
    down: migration_20261119_115023_account_lifecycle.down,
    name: '20261119_115023_account_lifecycle',
  },
  {
    up: migration_20261119_121350_recovery_fences.up,
    down: migration_20261119_121350_recovery_fences.down,
    name: '20261119_121350_recovery_fences',
  },
  {
    up: migration_20261119_130748_refund_checks.up,
    down: migration_20261119_130748_refund_checks.down,
    name: '20261119_130748_refund_checks',
  },
  {
    up: migration_20261119_131742_recovery_holds.up,
    down: migration_20261119_131742_recovery_holds.down,
    name: '20261119_131742_recovery_holds',
  },
  {
    up: migration_20261119_150000_restrict_data_api.up,
    down: migration_20261119_150000_restrict_data_api.down,
    name: '20261119_150000_restrict_data_api'
  },
];
