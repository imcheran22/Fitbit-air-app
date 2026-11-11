// Jest stand-in for @shopify/react-native-skia outside CharacterCanvas (which has its own stub):
// the recap export calls makeImageFromView, which tests configure per case.
module.exports = { makeImageFromView: jest.fn(), ImageFormat: { JPEG: 3, PNG: 4, WEBP: 6 } };
