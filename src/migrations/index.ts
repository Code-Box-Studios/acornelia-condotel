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
    name: '20261114_055830_customer_auth_capabilities'
  },
];
