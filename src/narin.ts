import * as z from 'zod'
import { MongoClient } from 'mongodb'

export const createNarinSchema = <N>(schema: z.ZodSchema<N>): NarinSchema<N> => {
    return {
        validate: (data: any): N => {
            return schema.parse(data)
        },
        serialize: (data: N): any => {
            return JSON.parse(JSON.stringify(data))
        }
    }
}

type NarinSchema<N> = {
    validate: (data: any) => N
    serialize: (data: N) => any
}

type NarinCollection<N> = {
    insertOne: (data: N) => Promise<N>;
    findOne: (query: any) => Promise<N | null>;
    find: (query: any) => Promise<N[]>;
    updateOne: (query: any, data: N) => Promise<N | null>;
    updateMany: (query: any, data: N) => Promise<number>;
    deleteOne: (query: any) => Promise<boolean>;
    deleteMany: (query: any) => Promise<number>;
    count: (query?: any) => Promise<number>;
};

type NarinDatabase = {
    collection: <N>(name: string, schema: NarinSchema<N>) => NarinCollection<N>;
    close: () => Promise<void>
};

export const connect = async (url_: string): Promise<NarinDatabase> => {
    const c_ = await MongoClient.connect(url_)
    
    const db_ = c_.db()

    const close = async () => {
        await c_.close()
    }

    return {
        collection: <N>(name: string, schema: NarinSchema<N>): NarinCollection<N> => {
            const col_ = db_.collection(name)

            return {
                insertOne: async (data: N): Promise<N> => {
                    const serializedData = schema.serialize(data);
                    const result = await col_.insertOne(serializedData);
                    const insertedId = result.insertedId;
                    const insertedDocument = await col_.findOne({ _id: insertedId });
                    return schema.validate(insertedDocument);
                },
                findOne: async (query: any): Promise<N | null> => {
                    const result = await col_.findOne(query);
                    return result ? schema.validate(result) : null;
                },
                find: async (query: any): Promise<N[]> => {
                    const results = await col_.find(query).toArray();
                    return results.map((result) => schema.validate(result));
                },
                updateOne: async (query: any, data: N): Promise<N | null> => {
                    const serializedData = schema.serialize(data);
                    const result = await col_.findOneAndUpdate(
                        query,
                        { $set: serializedData },
                        { returnDocument: "after" }
                    );
                    return result.value ? schema.validate(result.value) : null;
                },
                updateMany: async (query: any, data: N): Promise<number> => {
                    const serializedData = schema.serialize(data);
                    const result = await col_.updateMany(query, { $set: serializedData });
                    return result.modifiedCount;
                },
                deleteOne: async (query: any): Promise<boolean> => {
                    const result = await col_.deleteOne(query);
                    return result.deletedCount === 1;
                },
                deleteMany: async (query: any): Promise<number> => {
                    const result = await col_.deleteMany(query);
                    return result.deletedCount;
                },
                count: async (query?: any): Promise<number> => {
                    return col_.countDocuments(query);
                },
            }
        },
        close
    }
}