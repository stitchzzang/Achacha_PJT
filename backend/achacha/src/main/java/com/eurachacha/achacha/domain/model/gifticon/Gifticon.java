package com.eurachacha.achacha.domain.model.gifticon;

import java.time.LocalDate;

import com.eurachacha.achacha.domain.model.brand.Brand;
import com.eurachacha.achacha.domain.model.common.TimeStampEntity;
import com.eurachacha.achacha.domain.model.gifticon.enums.GifticonType;
import com.eurachacha.achacha.domain.model.sharebox.ShareBox;
import com.eurachacha.achacha.domain.model.user.User;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@AllArgsConstructor
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@Builder
@Getter
public class Gifticon extends TimeStampEntity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Integer id;

	@Column(length = 64)
	private String name;

	@Enumerated(EnumType.STRING)
	private GifticonType type;

	@Column(length = 32)
	private String barcode;

	private Integer originalAmount;

	private Integer remainingAmount;

	private LocalDate expiryDate;

	@Builder.Default
	private Boolean isUsed = false;

	@Builder.Default
	private Boolean isDeleted = false;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "user_id")
	private User user;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "sharebox_id")
	private ShareBox sharebox;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "brand_id")
	private Brand brand;

	// 사용 메서드
	public void use() {
		this.isUsed = true;
	}

	// 논리 삭제 메서드
	public void delete() {
		this.isDeleted = true;
	}

	// 금액권 사용 메서드
	public void use(Integer amount) {
		this.remainingAmount = this.remainingAmount - amount;

		if (this.remainingAmount == 0) {
			this.isUsed = true;
		}
	}

	public void updateRemainingAmount(Integer amount) {
		this.remainingAmount = amount;

		if (this.remainingAmount == 0) {
			this.isUsed = true;
		}
	}

	public void updateShareBox(ShareBox shareBox) {
		this.sharebox = shareBox;
	}
}
