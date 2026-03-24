# Oracle Field Service Plugin Core Library

This library provides an abstract class to quickstart the development of plugins for Oracle Field Service. It provides a core functionality that can be extended as needed.

An active environment of Oracle Field Service is needed to develop and execute plugins.

## Installation

1. If installing it from GitHub: 
   
   `npm install https://github.com/oracle-samples/ofs-plugin-core.git`

2. To use the library in your code:
   
    `import {OFSPlugin} from "@ofs_users/plugin"`

## Documentation and examples

Please see the `docs/' directory for documentation and a simple example.

## Oracle JET (OJET) / RequireJS compatibility

Starting with `@ofs-users/plugin@1.7.0`, this package publishes both ESM and AMD artifacts:

- ESM default: `dist/ofs-plugin.es.js`
- AMD subpath: `@ofs-users/plugin/amd` (`dist/ofs-plugin.amd.js`)

When integrating in OJET/RequireJS projects, use the AMD artifact and configure RequireJS paths to stable module IDs.

Example RequireJS path mapping:

```js
requirejs.config({
  paths: {
    "@ofs-users/plugin": "libs/ofs-plugin/ofs-plugin",
    "@ofs-users/proxy": "libs/ofs-proxy/ofs-proxy"
  }
});
```

Recommended runtime module IDs:

- `@ofs-users/plugin/amd`
- `@ofs-users/proxy/amd`

If your OJET optimizer expects runtime libs under app-local `src/js/libs/...`, copy the package AMD files to that location during your build sync step.

The main documentation for developing Oracle Field Service plugins is [here](https://docs.oracle.com/en/cloud/saas/field-service/fasdk/index.html)

## Contributing

This project welcomes contributions from the community. Before submitting a pull
request, please [review our contribution guide](./CONTRIBUTING.md).

## Security

Please consult the [security guide](./SECURITY.md) for our responsible security
vulnerability disclosure process.

## License

Copyright (c) 2023 Oracle and/or its affiliates.

Released under the Universal Permissive License v1.0 as shown at
<https://oss.oracle.com/licenses/upl/>.

ORACLE AND ITS AFFILIATES DO NOT PROVIDE ANY WARRANTY WHATSOEVER, EXPRESS OR IMPLIED, FOR ANY SOFTWARE, MATERIAL OR CONTENT OF ANY KIND CONTAINED OR PRODUCED WITHIN THIS REPOSITORY, AND IN PARTICULAR SPECIFICALLY DISCLAIM ANY AND ALL IMPLIED WARRANTIES OF TITLE, NON-INFRINGEMENT, MERCHANTABILITY, AND FITNESS FOR A PARTICULAR PURPOSE.  FURTHERMORE, ORACLE AND ITS AFFILIATES DO NOT REPRESENT THAT ANY CUSTOMARY SECURITY REVIEW HAS BEEN PERFORMED WITH RESPECT TO ANY SOFTWARE, MATERIAL OR CONTENT CONTAINED OR PRODUCED WITHIN THIS REPOSITORY.  IN ADDITION, AND WITHOUT LIMITING THE FOREGOING, THIRD PARTIES MAY HAVE POSTED SOFTWARE, MATERIAL OR CONTENT TO THIS REPOSITORY WITHOUT ANY REVIEW. USE AT YOUR OWN RISK. 
