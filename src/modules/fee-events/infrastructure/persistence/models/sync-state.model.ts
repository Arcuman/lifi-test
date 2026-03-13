import "reflect-metadata";

import {
  getModelForClass,
  index,
  modelOptions,
  prop
} from "@typegoose/typegoose";

@index({ key: 1 }, { unique: true })
@index({ leaseUntil: 1 })
@modelOptions({
  schemaOptions: {
    collection: "sync_state",
    versionKey: false
  }
})
export class SyncStateModelClass {
  @prop({ required: true, type: () => String })
  public key!: string;

  @prop({ required: true, type: () => Number })
  public chainId!: number;

  @prop({ required: true, type: () => String })
  public contractAddress!: string;

  @prop({ required: true, type: () => String })
  public eventName!: string;

  @prop({ required: true, default: 0, type: () => Number })
  public lastFinalizedScannedBlock!: number;

  @prop({ required: true, default: 0, type: () => Number })
  public reorgLookback!: number;

  @prop({ required: true, default: "idle", type: () => String })
  public status!: "idle" | "running" | "error";

  @prop({ type: () => String })
  public leaseOwner?: string;

  @prop({ type: () => Date })
  public leaseUntil?: Date;

  @prop({ type: () => Date })
  public lastHeartbeatAt?: Date;

  @prop({ type: () => String })
  public lastError?: string;

  @prop({ required: true, default: () => new Date(), type: () => Date })
  public updatedAt!: Date;
}

export const getSyncStateModel = () => getModelForClass(SyncStateModelClass);
