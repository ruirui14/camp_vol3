//撮影画面
import { useNavigate } from "react-router-dom";
import CameraFrames from "./camera_frame";

function Camera() {
  const navigate = useNavigate();

  const gotoChange = () => {
    navigate("/photo_change");
  };

  return (
    <>
      <h1>カメラぱしゃ</h1>
      <button onClick={gotoChange}>スーツチェンジ</button>
      <CameraFrames />
    </>
  );
}

export default Camera;
