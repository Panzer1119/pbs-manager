import { dataSync } from "./data-sync";

describe("dataSync", () => {
    it("should work", () => {
        expect(dataSync()).toEqual("data-sync");
    });
});
