'use strict';

var gulp = require('gulp');
var ghPages = require('gulp-gh-pages');

function deploy() {
  return gulp
    .src('./public/**/*')
    .pipe(ghPages());
}

gulp.task('deploy', deploy);