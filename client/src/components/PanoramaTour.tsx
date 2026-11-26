function streetViewEmbed(lat: number, lng: number) {
  const here = `${lat},${lng}`;
  const params = new URLSearchParams({
    q: here,
    layer: "c",
    cbll: here,
    cbp: "11,0,0,0,0",
    output: "svembed",
    hl: "en",
  });
  return `https://www.google.com/maps?${params.toString()}`;
}

function PanoramaTour({
  lat,
  lng,
  interactive = true,
}: {
  lat: number;
  lng: number;
  interactive?: boolean;
}) {
  return (
    <iframe
      className={interactive ? "street-view-frame" : "street-view-frame street-view-frame-static"}
      title="Google Street View in Calapan City"
      src={streetViewEmbed(lat, lng)}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}

export default PanoramaTour;
