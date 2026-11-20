/// <reference types="jest" />

import { presentationFor } from "./palco-app";

describe("PalcoApp", () => {
    test.each([
        [
            { type: "projection", text: "Santo", footer: "PIANO" },
            { title: "Santo", footer: "PIANO" }
        ],
        [
            { type: "idle", msg: "Aguardando" },
            { title: "Aguardando", footer: "" }
        ],
        [
            { type: "youare", slotLabel: "Palco 1" },
            { title: "Conectado: Palco 1", footer: "" }
        ],
        [
            { type: "timer", label: "05:00" },
            { title: "05:00", footer: "" }
        ],
        [{ type: "connectionLost" }, { title: "Configure host/porta ou aguarde a transmissão", footer: "" }]
    ])("maps %o", (message, expected) => {
        expect(presentationFor(message)).toEqual(expected);
    });
});
