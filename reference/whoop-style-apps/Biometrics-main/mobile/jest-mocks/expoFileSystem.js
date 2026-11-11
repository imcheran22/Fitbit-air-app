// Jest stand-in for expo-file-system's File/Paths API. Every File made is kept in File.instances
// so a test can read what was written and where.
class File {
  constructor(...parts) {
    this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    this.create = jest.fn();
    this.write = jest.fn();
    File.instances.push(this);
  }
}
File.instances = [];
module.exports = { File, Paths: { cache: { uri: 'file:///cache' } } };
