// Copyright (c) 2026 Roku, Inc.
// SPDX-License-Identifier: MIT

import "./compiled-components/BaseAppScene.xml";

import { enableExceptionTagging, main, registerAnchorNode } from "@roku-sdk/rsg-ts";

import PalcoApp from "./components/palco-app";

main(() => {
    enableExceptionTagging();
    console.log("Registering PalcoApp");
    registerAnchorNode(PalcoApp);
});
