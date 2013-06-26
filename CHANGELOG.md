# Change log

### v0.1.1

* Grab dependencies from bower.json file if it exists in a Bundle.  Makes integration with Bower easier.
* Add sourceFilePaths to files in filesToServe to keep track of which files were concatenated.
* Bug Fixes:
  * Run replaceCarteroDirTokens task before buildParcelRegistry so ##cartero_dir tokens are replaced with file's location before concatenation.

### v0.1.0

* Initial release
