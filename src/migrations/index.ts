import * as migration_20261114_030322_foundation from './20261114_030322_foundation';
import * as migration_20261114_030640_reservation_guards from './20261114_030640_reservation_guards';
import * as migration_20261114_032157_customer_identities from './20261114_032157_customer_identities';
import * as migration_20261114_032409_staff_access_boundary from './20261114_032409_staff_access_boundary';

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
    name: '20261114_032409_staff_access_boundary'
  },
];
