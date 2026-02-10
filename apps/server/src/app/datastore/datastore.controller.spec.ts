import { Test, TestingModule } from "@nestjs/testing";
import { DatastoreController } from "./datastore.controller";

describe("DatastoreController", () => {
    let controller: DatastoreController;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            controllers: [DatastoreController],
        }).compile();

        controller = module.get<DatastoreController>(DatastoreController);
    });

    it("should be defined", () => {
        expect(controller).toBeDefined();
    });
});
