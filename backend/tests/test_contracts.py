import base64
from io import BytesIO

import pytest
from PIL import Image
from pydantic import ValidationError

from project_pepsi.contracts import CapturedImage, ListingIngest, parse_listing_submission


def image(index: int = 0) -> dict:
    buffer = BytesIO()
    Image.new("RGB", (2, 1), "white").save(buffer, format="WEBP", quality=88)
    raw = buffer.getvalue()
    return {"contractVersion": 1, "imageIndex": index, "sourceUrl": "https://example.test/image", "sourceType": "test", "mediaType": "image/webp", "originalWidth": 3000, "originalHeight": 1500, "width": 2, "height": 1, "longEdge": 2, "quality": .88, "byteLength": len(raw), "dataUrl": "data:image/webp;base64," + base64.b64encode(raw).decode()}


def test_accepts_six_images():
    listing = ListingIngest(url="https://www.facebook.com/marketplace/item/1", title="Watch", images=[image(i) for i in range(6)])
    assert len(listing.images) == 6


def test_rejects_oversized_or_seventh_image():
    with pytest.raises(ValidationError): CapturedImage.model_validate({**image(), "width": 2049, "longEdge": 2049})
    with pytest.raises(ValidationError): ListingIngest(url="https://www.facebook.com/marketplace/item/1", title="Watch", images=[image(i) for i in range(7)])


def test_bad_image_is_rejected_without_losing_good_images():
    listing, rejected = parse_listing_submission({"url": "https://www.facebook.com/marketplace/item/1", "title": "Watch", "images": [image(0), {**image(1), "width": 4096}]})
    assert [item.imageIndex for item in listing.images] == [0]
    assert rejected == [1]
