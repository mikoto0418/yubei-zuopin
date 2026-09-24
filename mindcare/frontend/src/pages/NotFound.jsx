import React from "react";
import { Button } from "@mantine/core";
import { NotFoundState } from "../components/States.jsx";

export default function NotFound() {
  return (
    <div className="mc-flow">
      <NotFoundState desc="这个页面不存在，或者链接已经失效。" />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <Button component="a" href="#/dashboard" radius="lg" color="pink">
          回到首页
        </Button>
      </div>
    </div>
  );
}
