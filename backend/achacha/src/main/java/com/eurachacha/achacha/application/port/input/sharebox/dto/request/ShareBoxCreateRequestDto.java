package com.eurachacha.achacha.application.port.input.sharebox.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@AllArgsConstructor
@NoArgsConstructor
public class ShareBoxCreateRequestDto {

	@NotBlank(message = "쉐어박스 이름은 필수입니다")
	@Size(max = 16, message = "쉐어박스 이름은 최대 16자까지 입력 가능합니다")
	private String shareBoxName;
}
