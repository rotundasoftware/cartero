# Change Log

### v3.0.0
* Allow `parcelsDirPath` argument to cartero to be an array of explicit entry points, instead of a directory name.
* Combined `parcel_map.json` and `package_map.json` into one `metaData.json` file.
* NOTE: hooks written for cartero < v3.0.0 will NOT work with cartero v3.0.0 and later.
* Fixed some problems related to circular dependencies.
* There were no API changes in this version but since a hook is required we bumped the major version number.

### v2.2.0
* BREAKING CHANGE: Corrected spelling of "appTranform" and "appTranformDir" to "appTransforms" and "appTransformDirs"

### v2.1.0

* BREAKING CHANGE: Swapped out defaultTranforms for appTransforms.
* Dropped requirement that a parcel's package.json contain a `view` key.

### v2.0.0

* Complete re-write, based on npm and browserify. See cartero-1 branch for old version.

### v0.2.3
* ##cartero_dir replacement changes
	* Replace ##cartero_dir tokens in files before preprocessing.
	* Replace ##cartero_dir tokens in all preprocessingTask.inExt files.

### v0.2.2
* Add support for `remoteFiles` (such as CDN files) in bundle.json.

### v0.2.1
* Make `library` and `tmplExt` configuration properties optional.

### v0.2.0
* Add `allowNestedBundles` property in `library` directory configuration and default to `true`.
* Remove default value for `filesToIgnore` in `views` directory configuration.
* Make the browserify feature work without relying on the library directory being a node_modules folder.
* Allow ##cartero_requires directive value to span multiple lines.
* Support browserifying `.coffee` files.
* Bug Fixes:
	* Check for ##cartero_browserify_executeOnLoad in original file in case it was removed due to a processing step.
	* Fix order in which ##cartero_extends files are sourced.

### v0.1.1

* Grab dependencies from bower.json file if it exists in a Bundle.  Makes integration with Bower easier.
* Add sourceFilePaths to files in filesToServe to keep track of which files were concatenated.
* Bug Fixes:
  * Run replaceCarteroDirTokens task before buildParcelRegistry so ##cartero_dir tokens are replaced with file's location before concatenation.
	* Support directoriesToIgnore in bundle.json

### v0.1.0

* Initial release