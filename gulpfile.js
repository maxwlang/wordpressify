const { gulp, series, parallel, dest, src, watch } = require('gulp');
const webpackStream = require('webpack-stream');
const sourcemaps = require('gulp-sourcemaps');
const inject = require('gulp-inject-string');
const remoteSrc = require('gulp-remote-src');
const connect = require('gulp-connect-php');
const browserSync = require('browser-sync');
const imagemin = require('gulp-imagemin');
const plumber = require('gulp-plumber');
const minifyCSS = require('gulp-csso');
const zip = require('gulp-vinyl-zip');
const rename = require('gulp-rename');
const babel = require('gulp-babel');
const webpack = require('webpack');
const sass = require('gulp-sass');
const log = require('fancy-log');
const beeper = require('beeper');
const del = require('del');
const fs = require('fs');
sass.compiler = require('node-sass');

/* -------------------------------------------------------------------------------------------------
Theme Name
-------------------------------------------------------------------------------------------------- */
const themeName = 'wordpressify';

/* -------------------------------------------------------------------------------------------------
Installation Tasks
-------------------------------------------------------------------------------------------------- */
async function cleanup() {
	await del(['./build']);
	await del(['./dist']);
}

async function downloadWordPress() {
	await remoteSrc(['latest.zip'], {
		base: 'https://wordpress.org/',
	}).pipe(dest('./build/'));
}

async function unzipWordPress() {
	return await zip.src('./build/latest.zip').pipe(dest('./build/'));
}

async function copyConfig() {
	if (await fs.existsSync('./wp-config.php')) {
		return src('./wp-config.php')
			.pipe(inject.after("define( 'DB_COLLATE', '' );", "\ndefine( 'DISABLE_WP_CRON', true );"))
			.pipe(dest('./build/wordpress'));
	}
}

async function installationDone() {
	await beeper();
	await log(devServerReady);
	await log(thankYou);
}

exports.setup = series(cleanup, downloadWordPress);
exports.install = series(unzipWordPress, copyConfig, installationDone);

/* -------------------------------------------------------------------------------------------------
Development Tasks
-------------------------------------------------------------------------------------------------- */
function devServer() {
	connect.server(
		{
			base: './build/wordpress',
			port: '3020',
		},
		() => {
			browserSync({
				logPrefix: 'WordPressify',
				proxy: '127.0.0.1:3020',
				host: '127.0.0.1',
				port: '3010',
				open: 'external',
			});
		},
	);

	watch('./src/assets/scss/**/*.scss', stylesDev);
	watch('./src/assets/js/**', series(footerScriptsDev, Reload));
	watch('./src/assets/img/**', series(copyImagesDev, Reload));
	watch('./src/assets/fonts/**', series(copyFontsDev, Reload));
	watch('./src/theme/**', series(copyThemeDev, Reload));
	watch('./src/plugins/**', series(pluginsDev, Reload));
	watch('./build/wordpress/wp-config.php', { events: 'add' }, series(disableCron));
}

function Reload(done) {
	browserSync.reload();
	done();
}

function copyThemeDev() {
	if (!fs.existsSync('./build')) {
		log(buildNotFound);
		process.exit(1);
	} else {
		return src('./src/theme/**').pipe(dest('./build/wordpress/wp-content/themes/' + themeName));
	}
}

function copyImagesDev() {
	return src('./src/assets/img/**').pipe(
		dest('./build/wordpress/wp-content/themes/' + themeName + '/img'),
	);
}

function copyFontsDev() {
	return src('./src/assets/fonts/**').pipe(
		dest('./build/wordpress/wp-content/themes/' + themeName + '/fonts'),
	);
}

function stylesDev() {
	return src('./src/assets/scss/main.scss')
		.pipe(plumber({ errorHandler: onError }))
		.pipe(sourcemaps.init())
		.pipe(sass.sync({
			includePaths: [
				'node_modules/',
			],
		}).on('error', sass.logError))
		.pipe(minifyCSS())
		.pipe(sourcemaps.write('.'))
		.pipe(rename('style.css'))
		.pipe(dest(`./build/wordpress/wp-content/themes/${themeName}`))
		.pipe(browserSync.stream({ match: './build/wordpress/wp-content/themes/${themeName}/**/*.css' }));
}

function headerScriptsDev() {
	return src('./src/assets/js/**/header-*.js')
		.pipe(plumber({ errorHandler: onError }))
		.pipe(sourcemaps.init())
		.pipe(webpackStream({
            config: {
				mode: 'development',
				output: {
					filename: 'header-bundle.js',
				},
				plugins: [
					new webpack.ProvidePlugin({
						$: 'jquery',
						jQuery: 'jquery',
						'window.jQuery': 'jquery',
						swal: 'swal',
					}),
				],
			}
        }))
        .pipe(babel({
            presets: [
                '@babel/preset-env'
            ]
        }))
		.pipe(sourcemaps.write('.'))
		.pipe(dest('./build/wordpress/wp-content/themes/' + themeName + '/js'));
}

function footerScriptsDev() {
	return src('./src/assets/js/**/footer-*.js')
		.pipe(plumber({ errorHandler: onError }))
		.pipe(sourcemaps.init())
		.pipe(webpackStream({
            config: {
				mode: 'development',
				output: {
					filename: 'footer-bundle.js',
				},
				plugins: [
					new webpack.ProvidePlugin({
						$: 'jquery',
						jQuery: 'jquery',
						'window.jQuery': 'jquery',
						swal: 'swal',
					}),
				],
			}
        }))
        .pipe(babel({
            presets: [
                '@babel/preset-env',
            ]
        }))
		.pipe(sourcemaps.write('.'))
		.pipe(dest('./build/wordpress/wp-content/themes/' + themeName + '/js'));
}

function pluginsDev() {
	return src(['./src/plugins/**', '!./src/plugins/README.md']).pipe(
		dest('./build/wordpress/wp-content/plugins'),
	);
}

exports.dev = series(
	copyThemeDev,
	copyImagesDev,
	copyFontsDev,
	stylesDev,
	headerScriptsDev,
	footerScriptsDev,
	pluginsDev,
	devServer,
);

/* -------------------------------------------------------------------------------------------------
Production Tasks
-------------------------------------------------------------------------------------------------- */
async function cleanProd() {
	await del(['./dist']);
}

function copyThemeProd() {
	return src(['./src/theme/**', '!./src/theme/**/node_modules/**']).pipe(
		dest('./dist/themes/' + themeName),
	);
}

function copyFontsProd() {
	return src('./src/assets/fonts/**').pipe(dest('./dist/themes/' + themeName + '/fonts'));
}

function stylesProd() {
	return gulp.src('./src/assets/scss/main.scss')
		.pipe(sass.sync({
			includePaths: [
				'node_modules/',
			],
		}).on('error', sass.logError))
		.pipe(minifyCSS())
		.pipe(rename('style.css'))
		.pipe(dest('./dist/themes/' + themeName));
}

function headerScriptsProd() {
	return src('./src/assets/js/**/header-*.js')
		.pipe(plumber({ errorHandler: onError }))
		.pipe(webpackStream({
            config: {
				mode: 'production',
				output: {
					filename: 'header-bundle.js',
				},
				plugins: [
					new webpack.ProvidePlugin({
						$: 'jquery',
						jQuery: 'jquery',
						'window.jQuery': 'jquery',
						swal: 'swal',
					}),
				],
			}
        }))
        .pipe(babel({
            presets: [
                '@babel/preset-env', 
                'minify'
            ]
        }))
		.pipe(dest('./dist/themes/' + themeName + '/js'));
}

function footerScriptsProd() {
	return src('./src/assets/js/**/footer-*.js')
		.pipe(plumber({ errorHandler: onError }))
		.pipe(webpackStream({
            config: {
				mode: 'production',
				output: {
					filename: 'footer-bundle.js',
				},
				plugins: [
					new webpack.ProvidePlugin({
						$: 'jquery',
						jQuery: 'jquery',
						'window.jQuery': 'jquery',
						swal: 'swal',
					}),
				],
			}
        }))
        .pipe(babel({
            presets: [
                '@babel/preset-env', 
                'minify'
            ]
        }))
		.pipe(dest('./dist/themes/' + themeName + '/js'));
}

function pluginsProd() {
	return src(['./src/plugins/**', '!./src/plugins/**/*.md']).pipe(dest('./dist/plugins'));
}

function processImages() {
	return src('./src/assets/img/**')
		.pipe(plumber({ errorHandler: onError }))
		.pipe(
			imagemin([imagemin.svgo({ plugins: [{ removeViewBox: true }] })], {
				verbose: true,
			}),
		)
		.pipe(dest('./dist/themes/' + themeName + '/img'));
}

function zipProd() {
	return src('./dist/themes/' + themeName + '/**/*')
		.pipe(zip.dest('./dist/' + themeName + '.zip'))
		.on('end', () => {
			beeper();
			log(pluginsGenerated);
			log(filesGenerated);
			log(thankYou);
		});
}

exports.prod = series(
	cleanProd,
	copyThemeProd,
	copyFontsProd,
	stylesProd,
	headerScriptsProd,
	footerScriptsProd,
	pluginsProd,
	processImages,
	zipProd,
);

/* -------------------------------------------------------------------------------------------------
Utility Tasks
-------------------------------------------------------------------------------------------------- */
const onError = err => {
	beeper();
	log(wpFy + ' - ' + errorMsg + ' ' + err.toString());
	process.exit(1);
};

async function disableCron() {
	if (fs.existsSync('./build/wordpress/wp-config.php')) {
		await fs.readFile('./build/wordpress/wp-config.php', (err, data) => {
			if (err) {
				log(wpFy + ' - ' + warning + ' WP_CRON was not disabled!');
			}
			if (data) {
				if (data.indexOf('DISABLE_WP_CRON') >= 0) {
					log('WP_CRON is already disabled!');
				} else {
					return src('./build/wordpress/wp-config.php')
						.pipe(inject.after("define( 'DB_COLLATE', '' );", "\ndefine( 'DISABLE_WP_CRON', true );"))
						.pipe(dest('./build/wordpress'));
				}
			}
		});
	}
}

function Backup() {
	if (!fs.existsSync('./build')) {
		log(buildNotFound);
		process.exit(1);
	} else {
		return src('./build/**/*')
			.pipe(zip.dest('./backups/' + date + '.zip'))
			.on('end', () => {
				beeper();
				log(backupsGenerated);
				log(thankYou);
			});
	}
}

exports.backup = series(Backup);

/* -------------------------------------------------------------------------------------------------
Messages
-------------------------------------------------------------------------------------------------- */
const date = new Date().toLocaleDateString('en-US').replace(/\//g, '.');
const errorMsg = '\x1b[41mError\x1b[0m ';
const warning = '\x1b[43mWarning\x1b[0m ';
const devServerReady =
	'Your development server is ready, start the workflow with the command: $ \x1b[1mnpm run dev\x1b[0m';
const buildNotFound =
	errorMsg +
	'You need to install WordPress first. Run the command: $ \x1b[1mnpm run install:wordpress\x1b[0m';
const filesGenerated =
	`Your ZIP template file was generated in: \x1b[1m${__dirname}/dist/${themeName}.zip\x1b[0m -`;
const pluginsGenerated =
	`Plugins are generated in: \x1b[1m${__dirname}/dist/plugins/\x1b[0m -`;
const backupsGenerated =
	`Your backup was generated in: \x1b[1m${__dirname}/backups/${date}.zip\x1b[0m -`;
const wpFy = '\x1b[42m\x1b[1mWordPressify\x1b[0m';
const wpFyUrl = '\x1b[2m - http://www.wordpressify.co/\x1b[0m';
const thankYou = `Thank you for using ${wpFy} ${wpFyUrl}`;

/* -------------------------------------------------------------------------------------------------
End of all Tasks
-------------------------------------------------------------------------------------------------- */
