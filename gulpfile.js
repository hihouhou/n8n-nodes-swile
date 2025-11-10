const gulp = require('gulp');

function copyIcons() {
  return gulp
    .src('nodes/**/*.{png,svg}')
    .pipe(gulp.dest('dist/nodes'));
}

exports['build:icons'] = copyIcons;
exports.default = copyIcons;
