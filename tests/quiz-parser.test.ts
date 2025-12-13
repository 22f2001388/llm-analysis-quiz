import { describe, it, expect } from "vitest";
import { detectAnswerType } from "@/core/parsing/quiz-parser.js";

describe("detectAnswerType", () => {
  it("detects number type from sum keyword", () => {
    expect(detectAnswerType("Calculate the sum of column A")).toBe("number");
  });

  it("detects number type from count keyword", () => {
    expect(detectAnswerType("Count the number of rows")).toBe("number");
  });

  it("detects number type from average keyword", () => {
    expect(detectAnswerType("What is the average?")).toBe("number");
  });

  it("detects boolean type", () => {
    expect(detectAnswerType("Is this true/false?")).toBe("boolean");
    expect(detectAnswerType("Return a boolean value")).toBe("boolean");
  });

  it("detects data-uri type", () => {
    expect(detectAnswerType("Convert to base64")).toBe("data-uri");
    expect(detectAnswerType("Return data:image/png")).toBe("data-uri");
  });

  it("detects object type", () => {
    expect(detectAnswerType("Return as JSON")).toBe("object");
    expect(detectAnswerType("Parse the object")).toBe("object");
  });

  it("detects string type", () => {
    expect(detectAnswerType("Return the text value")).toBe("string");
  });

  it("returns undefined for ambiguous text", () => {
    expect(detectAnswerType("Do something random")).toBeUndefined();
  });
});
