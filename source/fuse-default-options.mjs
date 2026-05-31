// Fuse.js search tuning — https://fusejs.io/api/options.html
export var FUSE_THRESHOLD = 0.2
export var FUSE_DISTANCE = 64
export var FUSE_MIN_MATCH_CHAR_LENGTH = 2
export var FUSE_IGNORE_LOCATION = false

export var fuseDefaultSearchOptions = {
  threshold: FUSE_THRESHOLD,
  distance: FUSE_DISTANCE,
  minMatchCharLength: FUSE_MIN_MATCH_CHAR_LENGTH,
  ignoreLocation: FUSE_IGNORE_LOCATION
}
