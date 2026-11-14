import * as migration_20261114_030322_foundation from './20261114_030322_foundation';
import * as migration_20261114_030640_reservation_guards from './20261114_030640_reservation_guards';

export const migrations = [
  {
    up: migration_20261114_030322_foundation.up,
    down: migration_20261114_030322_foundation.down,
    name: '20261114_030322_foundation',
  },
  {
    up: migration_20261114_030640_reservation_guards.up,
    down: migration_20261114_030640_reservation_guards.down,
    name: '20261114_030640_reservation_guards'
  },
];
