# BA4L naming and TestFlight release

Doug requested TestFlight delivery using the established iOS release process and selected BA4L as the product name.

- Rename native display/product/Xcode target and web branding to BA4L; expand Big Al’s 4 Life in descriptions. Keep repo folder BAFL, existing bundle identity, storage keys, backend URLs and team links for compatibility.
- Reuse PMV/Jot signing team and App Store Connect API credentials. Register the existing bundle identifier, create the BA4L app record, add a valid icon and export metadata, then archive/upload version 1.0 build 2.
- Verify actual Apple upload and processing separately. Set up internal testing for Doug. No App Store production submission or external-tester invitation is part of this request.
- Verify web routes and simulator branding, preserve concurrent unrelated web work, commit named files, and deploy the committed web brand update.

Implementation includes a TypeScript release command with remote build checks, a local success receipt and private log files. Signing and encryption settings live in project.yml.

Verified: native scoring/parity harness passed 209,588 checks; web tests and production build passed; home/league screenshots reviewed [runtime-tested]. The renamed simulator app retained its saved scorebook. Signed build 2 includes the UserDefaults privacy declaration and uploaded successfully to Apple on September 10. App Store Connect app ID: 6810936804. Doug is the sole tester in BA4L Internal with automatic distribution.
