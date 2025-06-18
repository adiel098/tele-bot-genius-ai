
export class TarBuilder {
  private buffer: Uint8Array;
  private position: number;

  constructor() {
    this.buffer = new Uint8Array(1024 * 1024); // Start with 1MB buffer
    this.position = 0;
  }

  addFile(filename: string, content: Uint8Array): void {
    const header = this.createTarHeader(filename, content.length);
    this.ensureCapacity(header.length + content.length + 1024);
    
    // Add header
    this.buffer.set(header, this.position);
    this.position += header.length;
    
    // Add content
    this.buffer.set(content, this.position);
    this.position += content.length;
    
    // Pad to 512-byte boundary
    const padding = 512 - (content.length % 512);
    if (padding < 512) {
      this.position += padding;
    }
  }

  build(): Uint8Array {
    // Add two empty blocks at the end (TAR format requirement)
    this.ensureCapacity(this.position + 1024);
    const result = this.buffer.slice(0, this.position + 1024);
    return result;
  }

  private createTarHeader(filename: string, size: number): Uint8Array {
    const header = new Uint8Array(512);
    const encoder = new TextEncoder();
    
    // Filename (100 bytes)
    const nameBytes = encoder.encode(filename);
    header.set(nameBytes.slice(0, 100), 0);
    
    // File mode (8 bytes) - 644 in octal
    header.set(encoder.encode('000644 \0'), 100);
    
    // Owner ID (8 bytes)
    header.set(encoder.encode('000000 \0'), 108);
    
    // Group ID (8 bytes)
    header.set(encoder.encode('000000 \0'), 116);
    
    // File size (12 bytes)
    const sizeOctal = size.toString(8).padStart(11, '0') + '\0';
    header.set(encoder.encode(sizeOctal), 124);
    
    // Modification time (12 bytes)
    const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
    header.set(encoder.encode(mtime), 136);
    
    // Checksum placeholder (8 bytes)
    header.set(encoder.encode('        '), 148);
    
    // Type flag (1 byte) - regular file
    header.set(encoder.encode('0'), 156);
    
    // Calculate and set checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
    header.set(encoder.encode(checksumOctal), 148);
    
    return header;
  }

  private ensureCapacity(needed: number): void {
    if (needed > this.buffer.length) {
      const newSize = Math.max(needed, this.buffer.length * 2);
      const newBuffer = new Uint8Array(newSize);
      newBuffer.set(this.buffer);
      this.buffer = newBuffer;
    }
  }
}
