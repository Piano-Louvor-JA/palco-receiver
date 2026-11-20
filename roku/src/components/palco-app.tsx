import type { AnchorNodeDescriptor, AnchorNodeImplementation } from "@roku-sdk/rsg-ts";
import { defineAnchorNode, FieldType } from "@roku-sdk/rsg-ts";

export type PalcoMessage = {
    type: string;
    text?: string;
    footer?: string;
    msg?: string;
    slotLabel?: string;
    label?: string;
};

export const PalcoAppDescriptor: AnchorNodeDescriptor = {
    componentName: "PalcoApp",
    extends: "Group" as const,
    inputFields: { message: FieldType.Object<PalcoMessage>(), connectionState: FieldType.String() },
    outputFields: {}
};

export const presentationFor = (message?: PalcoMessage) => {
    if (!message || message.type === "connectionLost")
        return { title: "Configure host/porta ou aguarde a transmissão", footer: "" };
    if (message.type === "projection") return { title: message.text ?? "", footer: message.footer ?? "" };
    if (message.type === "idle") return { title: message.msg ?? "", footer: "" };
    if (message.type === "youare") return { title: `Conectado: ${message.slotLabel ?? ""}`, footer: "" };
    if (message.type === "timer") return { title: message.label ?? "", footer: "" };
    return { title: "", footer: "" };
};

const PalcoApp: AnchorNodeImplementation<typeof PalcoAppDescriptor> = inputs => {
    const presentation = () => presentationFor(inputs.message as PalcoMessage | undefined);
    const status = () =>
        inputs.connectionState === "connected"
            ? "Conectado ao PIANO Palco"
            : inputs.connectionState === "reconnecting"
              ? "Reconectando…"
              : "Pressione * para configurar conexão";

    return (
        <group>
            <rectangle width={1920} height={1080} color="0x000000FF" />
            <label
                id="status"
                text={status()}
                color="0xBBBBBBFF"
                translation={[56, 34]}
                width={1808}
                height={44}
                horizAlign="right"
            />
            <label
                id="lyrics"
                text={presentation().title}
                color="0xFFFFFFFF"
                translation={[96, 380]}
                width={1728}
                height={250}
                horizAlign="center"
                vertAlign="center"
                wrap
            />
            <label
                id="footer"
                text={presentation().footer}
                color="0xDDDDDDFF"
                translation={[96, 680]}
                width={1728}
                height={80}
                horizAlign="center"
            />
        </group>
    );
};

export default defineAnchorNode(PalcoAppDescriptor, PalcoApp);
