import { createReadStream, mkdirSync, renameSync, writeFileSync } from 'fs';
import { Readable } from 'stream';
import { Address } from 'web3x/address';

export interface TranscriptStore {
  saveTranscript(address: Address, num: number, path: string): Promise<void>;
  saveSignature(address: Address, num: number, signature: string): Promise<void>;
  loadTranscript(address: Address, num: number): Readable;
}

export class DiskTranscriptStore implements TranscriptStore {
  constructor(private storePath: string) {
    mkdirSync(storePath, { recursive: true });
  }

  public async saveTranscript(address: Address, num: number, path: string) {
    renameSync(path, `${this.storePath}/transcript_${address.toString().toLowerCase()}_${num}.dat`);
  }

  public async saveSignature(address: Address, num: number, signature: string) {
    writeFileSync(`${this.storePath}/transcript_${address.toString().toLowerCase()}_${num}.sig`, signature);
  }

  public loadTranscript(address: Address, num: number) {
    return createReadStream(`${this.storePath}/transcript_${address.toString().toLowerCase()}_${num}.dat`);
  }
}
