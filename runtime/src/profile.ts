export function validateProfile(value: any) {
  const name = typeof value?.name === 'string' ? value.name.trim() : '';
  if (!name || name.length > 80) throw Error('Choose a name between 1 and 80 characters.');
  const photo = value.photo ?? '';
  if (typeof photo !== 'string' || photo.length > 700000 || (photo && !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo))) throw Error('Choose a smaller JPEG or PNG profile photo.');
  return { name, photo: photo || null };
}
