export default class mongoWorker {
    private database: any;
    private mongoConnection: any;

    constructor(database: string, mongoConnection: any) {
        this.mongoConnection = mongoConnection;
        this.database = mongoConnection.db(database);
    }

    close(): Promise<any> {
        return new Promise((resolve) => resolve(this.mongoConnection.close()));
    }

    findSomeSync(
        collection: string,
        query: object,
        projectile: object,
        callback: (data: any) => void = () => {},
        limit?: number
    ): void {
        if (collection === null || query === null) {
            callback(null);
            return;
        }
        limit = limit || 1000;

        if (projectile !== undefined) {
            this.database
                .collection(collection)
                .find(query)
                .limit(limit)
                .project(projectile)
                .toArray((_: any, colls: any) => callback(colls));
            return;
        }

        this.database
            .collection(collection)
            .find(query)
            .limit(limit)
            .toArray((_: any, colls: any) => callback(colls));
    }

    findSomeOneSync(
        collection: string,
        query: object,
        projectile: object,
        callback = () => {}
    ): void {
        this.findSomeSync(collection, query, projectile, callback, 1);
    }

    getNextSequenceSync(
        collection: string,
        callback: (data: any) => void
    ): void {
        this.countSync(collection, {}, callback);
    }

    countSync(
        collection: string,
        query: object,
        callback: (data: any) => void = () => {}
    ): void {
        if (collection === null || query === null) {
            callback(null);
            return;
        }

        this.database
            .collection(collection)
            .find(query)
            .count((err: any, count: number) => callback(count));
    }

    async updateSomeSync(
        collection: string,
        query: object,
        to: object,
        callback: (data: any) => void = () => {}
    ) {
        callback(
            await this.database.collection(collection).updateMany(query, to)
        );
    }

    async updateSomeOneSync(
        collection: string,
        query: object,
        to: object,
        callback: (data: any) => void = () => {}
    ) {
        callback(
            await this.database.collection(collection).updateOne(query, to)
        );
    }

    async updateSomeOneBSync(
        collection: string,
        query: object,
        to: object,
        callback: (data: any) => void = () => {}
    ) {
        callback(
            await this.database
                .collection(collection)
                .findOneAndUpdate(query, to)
        );
    }

    async insertSomeSync(
        collection: string,
        query: object,
        callback: (data: any) => void = () => {}
    ) {
        callback(await this.database.collection(collection).insertMany(query));
    }

    async insertSomeOneSync(
        collection: string,
        query: object,
        callback: (data: any) => void = () => {}
    ) {
        callback(await this.database.collection(collection).insertOne(query));
    }

    async deleteSomeSync(
        collection: string,
        query: object,
        callback: (data: any) => void = () => {}
    ) {
        callback(await this.database.collection(collection).deleteOne(query));
    }

    findSome(
        collection: string,
        query: object,
        projectile?: object
    ): Promise<any> {
        if (collection === null || query === null) return null;

        if (projectile !== undefined)
            return new Promise((resolve) =>
                this.database
                    .collection(collection)
                    .find(query)
                    .project(projectile)
                    .toArray((_: any, colls: any) => resolve(colls))
            );

        return new Promise((resolve) =>
            this.database
                .collection(collection)
                .find(query)
                .toArray((_: any, colls: any) => resolve(colls))
        );
    }

    findSomeOne(
        collection: string,
        query: object,
        projectile: object
    ): Promise<any> {
        if (collection === null || query === null) return null;

        if (projectile !== undefined)
            return new Promise((resolve) =>
                this.database
                    .collection(collection)
                    .find(query)
                    .limit(1)
                    .project(projectile)
                    .toArray((_: any, colls: any) => resolve(colls))
            );

        return new Promise((resolve) =>
            this.database
                .collection(collection)
                .find(query)
                .limit(1)
                .toArray((_: any, colls: any) => resolve(colls))
        );
    }

    count(collection: string, query: object): Promise<any> {
        if (collection === null || query === null) return null;

        return new Promise((resolve) =>
            resolve(this.database.collection(collection).find(query).count())
        );
    }

    updateSome(collection: string, query: object, to: object): Promise<any> {
        return new Promise((resolve) =>
            resolve(this.database.collection(collection).updateMany(query, to))
        );
    }

    updateSomeOne(collection: string, query: object, to: object): Promise<any> {
        return new Promise((resolve) =>
            resolve(this.database.collection(collection).updateOne(query, to))
        );
    }

    updateSomeOneB(
        collection: string,
        query: object,
        to: object
    ): Promise<any> {
        return new Promise((resolve) =>
            resolve(
                this.database.collection(collection).findOneAndUpdate(query, to)
            )
        );
    }

    insertSome(collection: string, query: object): Promise<any> {
        return new Promise((resolve) =>
            resolve(this.database.collection(collection).insertMany(query))
        );
    }

    insertSomeOne(collection: string, query: object): Promise<any> {
        return new Promise((resolve) =>
            resolve(this.database.collection(collection).insertOne(query))
        );
    }

    deleteSome(collection: string, query: object): Promise<any> {
        return new Promise((resolve) =>
            resolve(this.database.collection(collection).deleteOne(query))
        );
    }
}
