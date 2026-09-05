import base64
import binascii
from io import BytesIO
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, ValidationError, model_validator
from PIL import Image, UnidentifiedImageError


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CapturedImage(ContractModel):
    contractVersion: Literal[1]
    imageIndex: int = Field(ge=0)
    sourceUrl: str = ""
    sourceType: str = "unknown"
    mediaType: Literal["image/jpeg", "image/webp"]
    originalWidth: int = Field(gt=0)
    originalHeight: int = Field(gt=0)
    width: int = Field(gt=0, le=2048)
    height: int = Field(gt=0, le=2048)
    longEdge: int = Field(gt=0, le=2048)
    quality: float = Field(ge=0.8, le=0.95)
    byteLength: int = Field(gt=0, le=2_000_000)
    dataUrl: str

    @model_validator(mode="after")
    def validate_transport(self) -> "CapturedImage":
        if self.longEdge != max(self.width, self.height):
            raise ValueError("longEdge must match submitted dimensions")
        expected = f"data:{self.mediaType};base64,"
        if not self.dataUrl.startswith(expected):
            raise ValueError("dataUrl media type does not match metadata")
        try:
            raw = base64.b64decode(self.dataUrl[len(expected):], validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("image payload is not valid base64") from exc
        if len(raw) != self.byteLength or len(raw) > 2_000_000:
            raise ValueError("image payload size does not match metadata or exceeds cap")
        try:
            with Image.open(BytesIO(raw)) as decoded:
                decoded.verify()
            with Image.open(BytesIO(raw)) as decoded:
                if decoded.size != (self.width, self.height):
                    raise ValueError("decoded image dimensions do not match metadata")
                expected_format = "JPEG" if self.mediaType == "image/jpeg" else "WEBP"
                if decoded.format != expected_format:
                    raise ValueError("decoded image format does not match media type")
        except (UnidentifiedImageError, OSError) as exc:
            raise ValueError("image payload could not be decoded") from exc
        return self


class ListingIngest(ContractModel):
    contractVersion: Literal[1] = 1
    source: Literal["facebook_marketplace"] = "facebook_marketplace"
    sourceListingId: str = Field(default="", max_length=255)
    url: HttpUrl
    title: str = Field(min_length=1, max_length=500)
    rawText: str = Field(default="", max_length=12_000)
    price: float | None = Field(default=None, ge=0)
    locationText: str = Field(default="", max_length=200)
    distanceMiles: float | None = Field(default=None, ge=0)
    images: list[CapturedImage] = Field(default_factory=list, max_length=6)


class Identification(ContractModel):
    brand: str
    model: str
    reference: str
    confidence: int = Field(ge=0, le=100)


class ImageClassification(ContractModel):
    imageIndex: int
    category: Literal["dial/front", "caseback", "clasp/bracelet", "side/crown", "movement", "serial/reference/engraving", "box/papers", "wrist shot", "other"]
    confidence: int = Field(ge=0, le=100)
    observations: list[str] = Field(max_length=5)


class WatchAnalysis(ContractModel):
    relevant: bool
    identification: Identification
    imageClassifications: list[ImageClassification] = Field(max_length=6)
    conditionSignals: list[str] = Field(max_length=6)
    riskSignals: list[str] = Field(max_length=6)
    completenessAssessment: list[str] = Field(max_length=6)
    valuationObservations: list[str] = Field(max_length=8)
    missingInformation: list[str] = Field(max_length=8)
    questions: list[str] = Field(max_length=6)
    recommendation: Literal["investigate", "watch", "skip"]
    rationale: str


class TradeEconomicsInput(ContractModel):
    received_qlv: int = Field(ge=0)
    given_qlv: int = Field(ge=0)
    cash_added: int = Field(ge=0)
    transaction_cost: int = Field(ge=0)
    risk_penalty: int = Field(ge=0)
    transaction_friction: int = Field(ge=0)
    minimum_alpha: int = Field(default=200, ge=0)


class ManualListingInput(ContractModel):
    url: HttpUrl
    rawText: str = Field(default="", max_length=120_000)
    brand: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=200)
    reference: str = Field(min_length=1, max_length=100)
    ask: float = Field(ge=0)
    receivedQlv: float = Field(ge=0)
    givenQlv: float = Field(ge=0)
    cashPaid: float = Field(ge=0)
    costs: float = Field(ge=0)
    riskPenalty: float = Field(ge=0)
    liquidityBonus: float = Field(ge=0)
    dealerAskMedian: float = Field(default=0, ge=0)
    privateAskMedian: float = Field(default=0, ge=0)
    clearingEstimate: float = Field(default=0, ge=0)
    qlvHaircutBps: int = Field(default=1000, ge=0, le=10_000)


class NormalizeInput(ContractModel):
    url: HttpUrl | None = None
    text: str = Field(default="", max_length=120_000)


def parse_listing_submission(payload: dict) -> tuple[ListingIngest, list[int]]:
    """Validate images independently so one bad capture cannot poison a listing."""
    raw_images = payload.get("images", [])
    if not isinstance(raw_images, list):
        raw_images = []
    usable: list[CapturedImage] = []
    rejected: list[int] = []
    for position, raw_image in enumerate(raw_images[:6]):
        try:
            usable.append(CapturedImage.model_validate(raw_image))
        except (ValidationError, TypeError):
            index = raw_image.get("imageIndex", position) if isinstance(raw_image, dict) else position
            rejected.append(index if isinstance(index, int) else position)
    rejected.extend(range(6, len(raw_images)))
    listing_payload = {key: value for key, value in payload.items() if key != "images"}
    return ListingIngest.model_validate({**listing_payload, "images": usable}), rejected
