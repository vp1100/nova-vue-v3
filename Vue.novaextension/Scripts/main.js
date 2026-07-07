"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;

var activate_1 = require("./activation/activate");
Object.defineProperty(exports, "activate", { enumerable: true, get: function () { return activate_1.activate; } });
Object.defineProperty(exports, "deactivate", { enumerable: true, get: function () { return activate_1.deactivate; } });
